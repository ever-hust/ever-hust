/**
 * Jest-only stand-in for `unpdf`: loads the REAL package through Node's own
 * module loader.
 *
 * unpdf ships ES modules only (dist/index.mjs). This repo runs Jest in CJS mode
 * (see jest.config.ts), and ts-jest turns `await import("unpdf")` into a
 * `require`, which Jest's own module registry refuses for an .mjs file ("Must
 * use import to load ES Module"). Node itself can `require()` an ES module
 * graph without top-level await (Node 22.12+, the repo needs Node 24+), so this
 * file asks Node, not Jest, for the module. Jest replaces `require("module")`
 * with its own resolver (which would map "unpdf" back to this file), so the
 * real `createRequire` comes from `process.getBuiltinModule`. Nothing is
 * mocked: the tests run the same unpdf and PDF.js code as the server.
 */
const { createRequire } = process.getBuiltinModule("node:module");

module.exports = createRequire(__filename)("unpdf");
