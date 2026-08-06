import type { ServerJournal } from "../../domain/ports/ServerJournal";

/**
 * Turns an unreadable log directory into a reported problem instead of a
 * failed request. A missing read-only mount or a permission mistake must
 * degrade the page, never take the whole site down.
 */
export function tolerant(journal: ServerJournal, onProblem: (message: string) => void): ServerJournal {
  function report(action: string, error: unknown): void {
    // The detail names filesystem paths and this message reaches the public
    // status page, so it goes to the logs instead.
    console.error(`Journal unavailable while reading the ${action}`, error);
    onProblem(`Lecture des journaux du serveur impossible (${action}).`);
  }

  return {
    async available() {
      try {
        return await journal.available();
      } catch (error) {
        report("liste des fichiers", error);
        return [];
      }
    },

    async tail(fileName, lines) {
      // Deliberately not caught: the log panel must say that a file it just
      // listed could not be read, rather than show an empty page.
      return journal.tail(fileName, lines);
    },

    async lastActivityAt() {
      try {
        return await journal.lastActivityAt();
      } catch (error) {
        report("dernière activité", error);
        return null;
      }
    },

    async currentBuild() {
      try {
        return await journal.currentBuild();
      } catch (error) {
        report("version du jeu", error);
        return null;
      }
    },
  };
}
