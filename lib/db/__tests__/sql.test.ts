import { describe, expect, it } from "vitest";
import { assign, ident, insertRow, join, sql } from "../sql";

describe("sql``", () => {
  it("convierte cada interpolación en un parámetro numerado", () => {
    const query = sql`select * from teams where id = ${"abc"} and active = ${true}`;
    expect(query.text).toBe(
      "select * from teams where id = $1 and active = $2",
    );
    expect(query.values).toEqual(["abc", true]);
  });

  it("nunca mete el valor en el texto, ni con comillas o punto y coma", () => {
    const malicious = "'; drop table teams; --";
    const query = sql`select * from teams where name = ${malicious}`;
    expect(query.text).toBe("select * from teams where name = $1");
    expect(query.text).not.toContain("drop table");
    expect(query.values).toEqual([malicious]);
  });

  it("reindexa los parámetros al anidar fragmentos", () => {
    const where = sql`name = ${"Tigres"} and color = ${"#fff"}`;
    const query = sql`select ${"id"} from teams where ${where} limit ${10}`;
    expect(query.text).toBe("select $1 from teams where name = $2 and color = $3 limit $4");
    expect(query.values).toEqual(["id", "Tigres", "#fff", 10]);
  });

  it("trata undefined como null", () => {
    const query = sql`select ${undefined}`;
    expect(query.values).toEqual([null]);
  });
});

describe("ident()", () => {
  it("entrecomilla nombres válidos", () => {
    expect(ident("teams").quoted).toBe('"teams"');
    expect(ident("auth", "users").quoted).toBe('"auth"."users"');
  });

  it("rechaza cualquier nombre con caracteres peligrosos", () => {
    expect(() => ident('teams" ; drop table teams; --')).toThrow();
    expect(() => ident("game events")).toThrow();
    expect(() => ident("")).toThrow();
  });

  it("se interpola literal, no como parámetro", () => {
    const query = sql`select * from ${ident("game_events")} where id = ${"x"}`;
    expect(query.text).toBe('select * from "game_events" where id = $1');
    expect(query.values).toEqual(["x"]);
  });
});

describe("join()", () => {
  it("une fragmentos manteniendo la numeración", () => {
    const parts = [sql`a = ${1}`, sql`b = ${2}`, sql`c = ${3}`];
    const query = sql`where ${join(parts, " and ")}`;
    expect(query.text).toBe("where a = $1 and b = $2 and c = $3");
    expect(query.values).toEqual([1, 2, 3]);
  });
});

describe("assign() e insertRow()", () => {
  it("arma el SET de un update", () => {
    const query = sql`update teams set ${assign({ name: "Tigres", color: null })} where id = ${"7"}`;
    expect(query.text).toBe(
      'update teams set "name" = $1, "color" = $2 where id = $3',
    );
    expect(query.values).toEqual(["Tigres", null, "7"]);
  });

  it("arma columnas y valores de un insert", () => {
    const query = sql`insert into teams ${insertRow({ name: "Osos", division_id: "d1" })}`;
    expect(query.text).toBe('insert into teams ("name", "division_id") values ($1, $2)');
    expect(query.values).toEqual(["Osos", "d1"]);
  });

  it("rechaza objetos vacíos", () => {
    expect(() => assign({})).toThrow();
    expect(() => insertRow({})).toThrow();
  });
});
