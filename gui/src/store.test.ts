import { describe, expect, it } from "vitest";
import { ROOT, renameParam } from "./model/schema";
import { store } from "./store";

describe("store", () => {
  it("makes the commits of a field being typed into one undo step", () => {
    store.open({ title: "" }, null);
    for (const title of ["a", "ab", "abc"]) store.commit({ title }, undefined, "schema:title");
    store.endEdit();
    store.commit({ title: "abc", description: "d" });

    store.undo();
    expect(store.schema).toEqual({ title: "abc" });
    store.undo();
    expect(store.schema).toEqual({ title: "" });
    expect(store.canUndo).toBe(false);
  });

  it("starts a new undo step when the same field is typed into again", () => {
    store.open({ title: "" }, null);
    store.commit({ title: "a" }, undefined, "schema:title");
    store.endEdit();
    store.commit({ title: "ab" }, undefined, "schema:title");

    store.undo();
    expect(store.schema).toEqual({ title: "a" });
  });

  it("keeps a parameter's key when it is renamed", () => {
    store.open({ type: "object", properties: { input: { type: "string" } } }, null);
    const key = store.keyOf("input");
    store.commit(renameParam(store.schema, ROOT, "input", "samplesheet"), { from: "input", to: "samplesheet" });
    expect(store.keyOf("samplesheet")).toBe(key);
  });
});
