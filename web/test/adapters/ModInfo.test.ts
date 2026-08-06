import { describe, expect, it } from "bun:test";

import {
  isHigher,
  parseModInfo,
  parseSettingList,
  readIniSetting,
  versionScore,
} from "../../src/adapters/catalog/ModInfo";

// Copied verbatim from 2409333430/mods/91range/42.13/mod.info on the server.
const REAL_MOD_INFO = `name='91 RANGE ROVER Classic
id=91range
require=\\damnlib
poster=preview.png
icon=icon.png
description=This mod adds RANGE ROVER Classic, SUV from 1991
author=KI5
category=vehicle
versionMin=42.13.0`;

describe("parseModInfo", () => {
  it("reads the fields of a real mod.info", () => {
    const fields = parseModInfo(REAL_MOD_INFO);

    expect(fields.id).toBe("91range");
    expect(fields.name).toBe("'91 RANGE ROVER Classic");
    expect(fields.author).toBe("KI5");
    expect(fields.category).toBe("vehicle");
    expect(fields.poster).toBe("preview.png");
  });

  it("keeps everything after the first equals sign", () => {
    expect(parseModInfo("description=Adds a=b to the game").description).toBe(
      "Adds a=b to the game",
    );
  });

  it("ignores lines without a separator", () => {
    expect(parseModInfo("garbage\nid=x")).toEqual({ id: "x" });
  });

  it("is case-insensitive on keys", () => {
    expect(parseModInfo("ID=x\nName=Y")).toEqual({ id: "x", name: "Y" });
  });
});

describe("versionScore", () => {
  it("ranks a Build 42 variant above a legacy one", () => {
    const build42 = versionScore("mods/91range/42.13/mod.info");
    const legacy = versionScore("mods/90niva/mod.info");

    expect(build42).toEqual([1, 42, 13]);
    expect(legacy).toEqual([0, 0, 0]);
    expect(isHigher(build42, legacy)).toBe(true);
  });

  it("ranks a higher build above a lower one", () => {
    expect(isHigher(versionScore("mods/x/42.13/mod.info"), versionScore("mods/x/42/mod.info"))).toBe(
      true,
    );
    expect(isHigher(versionScore("mods/x/42/mod.info"), versionScore("mods/x/42.13/mod.info"))).toBe(
      false,
    );
  });

  it("does not consider an equal score higher", () => {
    expect(isHigher([1, 42, 13], [1, 42, 13])).toBe(false);
  });

  it("reproduces the quirk of a purely numeric mod directory", () => {
    // scripts/discover_mods.py behaves the same way. The two must agree.
    expect(versionScore("mods/12345/mod.info")).toEqual([1, 12345, 0]);
  });
});

describe("parseSettingList", () => {
  it("splits a semicolon-separated setting and drops the empties", () => {
    expect(parseSettingList("damnlib;91range;;63beetle;")).toEqual([
      "damnlib",
      "91range",
      "63beetle",
    ]);
  });

  it("returns nothing for an empty setting", () => {
    expect(parseSettingList("")).toEqual([]);
  });
});

describe("readIniSetting", () => {
  const ini = "Public=false\nMods=damnlib;91range\nWorkshopItems=3171167894\n";

  it("reads a setting", () => {
    expect(readIniSetting(ini, "Mods")).toBe("damnlib;91range");
  });

  it("returns null for an absent setting", () => {
    expect(readIniSetting(ini, "Absent")).toBeNull();
  });

  it("does not match a setting whose name is a suffix of another", () => {
    expect(readIniSetting("WorkshopItems=1\n", "Items")).toBeNull();
  });

  it("returns an empty string for a setting with no value", () => {
    expect(readIniSetting("Mods=\n", "Mods")).toBe("");
  });
});
