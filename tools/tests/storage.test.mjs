import assert from "node:assert/strict";
import test from "node:test";
import { migrateStorageValue, storageKey } from "../../web/scripts/storage.ts";

const memoryStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test("legacy preferences move to the versioned key", () => {
  const storage = memoryStorage();
  storage.setItem("ui-theme", "dark");
  assert.equal(migrateStorageValue(storage, storageKey("ui-theme"), "ui-theme"), "dark");
  assert.equal(storage.getItem("portfolio:v1:ui-theme"), "dark");
  assert.equal(storage.getItem("ui-theme"), null);
});

test("the session highscore takes precedence and the old persistent record is removed", () => {
  const session = memoryStorage();
  const persistent = memoryStorage();
  session.setItem("portfolio:v1:snake-highscore", "12");
  persistent.setItem("snake-high-score", "25");
  assert.equal(migrateStorageValue(session, storageKey("snake-highscore"), "snake-high-score", persistent), "12");
  assert.equal(persistent.getItem("snake-high-score"), null);
  assert.equal(persistent.getItem("portfolio:v1:snake-highscore"), null);
});

test("a persistent highscore migrates to session storage", () => {
  const session = memoryStorage();
  const persistent = memoryStorage();
  persistent.setItem("snake-high-score", "25");
  migrateStorageValue(session, storageKey("snake-highscore"), "snake-high-score", persistent);
  assert.equal(session.getItem("portfolio:v1:snake-highscore"), "25");
  assert.equal(persistent.getItem("snake-high-score"), null);
});

test("a failed write preserves the original value", () => {
  const storage = memoryStorage();
  storage.setItem("ui-theme", "light");
  storage.setItem = () => { throw new Error("Storage unavailable"); };
  assert.throws(() => migrateStorageValue(storage, storageKey("ui-theme"), "ui-theme"));
  assert.equal(storage.getItem("ui-theme"), "light");
});
