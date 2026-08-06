import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { createWorkshopMods } from "../../src/adapters/catalog/WorkshopMods";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d76360000000020001e221bc330000000049454e44ae426082",
  "hex",
);

let root: string;
let problems: string[];

function content(...parts: string[]): string {
  return join(root, "files/steamapps/workshop/content/108600", ...parts);
}

async function put(path: string, body: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

async function writeIni(mods: string, items: string): Promise<void> {
  await put(
    join(root, "config/Server/pzserver.ini"),
    `Public=false\nMods=${mods}\nWorkshopItems=${items}\n`,
  );
}

function build() {
  return createWorkshopMods(
    {
      configDirectory: join(root, "config"),
      filesDirectory: join(root, "files"),
      serverName: "pzserver",
    },
    (message) => problems.push(message),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pz-mods-"));
  problems = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createWorkshopMods", () => {
  it("describes the mods the server declares, in that order", async () => {
    await writeIni("91range;damnlib", "2409333430;3171167894");
    await put(
      content("2409333430/mods/91range/mod.info"),
      "id=91range\nname='91 RANGE ROVER Classic\nauthor=KI5\ncategory=vehicle\n",
    );
    await put(content("3171167894/mods/damnlib/mod.info"), "id=damnlib\nname=DamnLib\n");

    const mods = await build().catalog.activeMods();

    expect(mods.map((mod) => mod.id)).toEqual(["91range", "damnlib"]);
    expect(mods[0]).toMatchObject({
      name: "'91 RANGE ROVER Classic",
      author: "KI5",
      category: "vehicle",
      workshopItemId: "2409333430",
    });
    expect(problems).toEqual([]);
  });

  it("prefers the Build 42 variant when a mod ships several", async () => {
    await writeIni("91range", "2409333430");
    await put(content("2409333430/mods/91range/mod.info"), "id=91range\nname=Legacy\n");
    await put(content("2409333430/mods/91range/42.13/mod.info"), "id=91range\nname=Build 42\n");

    const mods = await build().catalog.activeMods();

    expect(mods).toHaveLength(1);
    expect(mods[0]!.name).toBe("Build 42");
  });

  it("ignores a Workshop item whose mods the server does not enable", async () => {
    await writeIni("damnlib", "2409333430;3171167894");
    await put(content("2409333430/mods/91range/mod.info"), "id=91range\nname=Range\n");
    await put(content("3171167894/mods/damnlib/mod.info"), "id=damnlib\nname=DamnLib\n");

    const mods = await build().catalog.activeMods();

    expect(mods.map((mod) => mod.id)).toEqual(["damnlib"]);
  });

  it("still lists a declared mod whose files never downloaded", async () => {
    await writeIni("ghost", "9999999999");

    const mods = await build().catalog.activeMods();

    expect(mods).toEqual([
      {
        id: "ghost",
        workshopItemId: "",
        name: "ghost",
        author: null,
        description: null,
        category: null,
        poster: null,
      },
    ]);
  });

  it("reports a missing server configuration instead of failing", async () => {
    const mods = await build().catalog.activeMods();

    expect(mods).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("configuration du serveur est introuvable");
  });

  it("keeps filesystem paths out of a problem shown on the public page", async () => {
    await build().catalog.activeMods();

    expect(problems[0]).not.toContain(root);
    expect(problems[0]).not.toContain("/");
  });

  describe("posters", () => {
    it("finds the image declared by mod.info", async () => {
      await writeIni("91range", "2409333430");
      await put(
        content("2409333430/mods/91range/mod.info"),
        "id=91range\nname=Range\nposter=preview.png\n",
      );
      await put(content("2409333430/mods/91range/preview.png"), PNG);

      const { catalog, posters } = build();
      const mods = await catalog.activeMods();
      const image = await posters.find("91range");

      expect(mods[0]!.poster).toEqual({ source: "local" });
      expect(image?.contentType).toBe("image/png");
      expect(image?.bytes).toHaveLength(PNG.length);
      expect(image?.fingerprint).toMatch(/^\d+-\d+/);
    });

    it("falls back to the image one level up for a build subdirectory", async () => {
      await writeIni("m998", "2642541073");
      await put(content("2642541073/mods/m998/42.13/mod.info"), "id=m998\nname=M998\n");
      await put(content("2642541073/mods/m998/preview.png"), PNG);

      const { catalog, posters } = build();

      expect((await catalog.activeMods())[0]!.poster).toEqual({ source: "local" });
      expect(await posters.find("m998")).not.toBeNull();
    });

    it("refuses a poster path escaping the Workshop item", async () => {
      await writeIni("evil", "1111111111");
      await put(
        content("1111111111/mods/evil/mod.info"),
        "id=evil\nname=Evil\nposter=../../../../../../etc/passwd\n",
      );

      const { catalog, posters } = build();

      expect((await catalog.activeMods())[0]!.poster).toBeNull();
      expect(await posters.find("evil")).toBeNull();
    });

    it("refuses a poster that is a symbolic link out of the Workshop item", async () => {
      // A hostile Workshop item could ship preview.png -> /etc/passwd. A purely
      // textual containment check passes it, then stat and readFile follow the
      // link and the file is served publicly.
      await writeIni("evil", "1111111111");
      await put(content("1111111111/mods/evil/mod.info"), "id=evil\nname=Evil\n");
      await put(join(root, "outside", "secret.png"), PNG);
      await symlink(
        join(root, "outside", "secret.png"),
        content("1111111111/mods/evil/preview.png"),
      );

      const { catalog, posters } = build();

      expect((await catalog.activeMods())[0]!.poster).toBeNull();
      expect(await posters.find("evil")).toBeNull();
    });

    it("accepts a symbolic link that stays inside the Workshop item", async () => {
      await writeIni("shared", "1111111111");
      await put(content("1111111111/mods/shared/mod.info"), "id=shared\nname=Shared\n");
      await put(content("1111111111/common/art.png"), PNG);
      await symlink(
        content("1111111111/common/art.png"),
        content("1111111111/mods/shared/preview.png"),
      );

      const { catalog, posters } = build();

      expect((await catalog.activeMods())[0]!.poster).toEqual({ source: "local" });
      expect((await posters.find("shared"))?.contentType).toBe("image/png");
    });

    it("refuses a poster whose extension is not an image", async () => {
      await writeIni("sneaky", "1111111111");
      await put(
        content("1111111111/mods/sneaky/mod.info"),
        "id=sneaky\nname=Sneaky\nposter=../../../../../../etc/passwd\n",
      );
      await put(content("1111111111/mods/sneaky/notes.txt"), "not an image");

      const { catalog, posters } = build();

      expect((await catalog.activeMods())[0]!.poster).toBeNull();
      expect(await posters.find("sneaky")).toBeNull();
    });

    it("reports no poster when the mod ships none", async () => {
      await writeIni("plain", "1111111111");
      await put(content("1111111111/mods/plain/mod.info"), "id=plain\nname=Plain\n");

      const { catalog, posters } = build();

      expect((await catalog.activeMods())[0]!.poster).toBeNull();
      expect(await posters.find("plain")).toBeNull();
    });
  });

  it("rescans after the server configuration changes", async () => {
    await writeIni("damnlib", "3171167894");
    await put(content("3171167894/mods/damnlib/mod.info"), "id=damnlib\nname=DamnLib\n");
    const { catalog } = build();

    expect(await catalog.activeMods()).toHaveLength(1);

    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeIni("damnlib;91range", "3171167894;2409333430");
    await put(content("2409333430/mods/91range/mod.info"), "id=91range\nname=Range\n");

    expect((await catalog.activeMods()).map((mod) => mod.id)).toEqual(["damnlib", "91range"]);
  });
});
