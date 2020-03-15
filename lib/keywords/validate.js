const Pact = require("@hyperjump/pact");
const PubSub = require("pubsub-js");
const Core = require("../core");
const Json = require("../json");
const Schema = require("../schema");


const compile = async (schema, ast) => {
  const url = Schema.uri(schema);
  if (!(url in ast)) {
    ast[url] = false; // Place dummy entry in ast to avoid recursive loops
    const schemaValue = Schema.value(schema);
    ast[url] = [
      `${schema.schemaVersion}#validate`,
      Schema.uri(schema),
      typeof schemaValue === "boolean" ? schemaValue : await Pact.pipeline([
        Schema.entries,
        Pact.map(([keyword, keywordSchema]) => {
          const keywordId = `${schema.schemaVersion}#${keyword}`;
          return [keywordId, keywordSchema];
        }),
        Pact.filter(([keywordId]) => Core.hasKeyword(keywordId)),
        Pact.map(async ([keywordId, keywordSchemaPromise]) => {
          const keywordSchema = await keywordSchemaPromise;
          const keywordAst = await Core.getKeyword(keywordId).compile(keywordSchema, ast);
          return [keywordId, Schema.uri(keywordSchema), keywordAst];
        }),
        Pact.all
      ], schema)
    ];
  }
};

const interpret = (uri, json, ast) => {
  const [keywordId, schemaUrl, nodes] = ast[uri];

  const isValid = typeof nodes === "boolean" ? nodes : nodes
    .every(([keywordId, schemaUrl, keywordValue]) => {
      const isValid = Core.getKeyword(keywordId).interpret(keywordValue, json, ast);

      PubSub.publishSync("result", {
        keyword: keywordId,
        absoluteKeywordLocation: schemaUrl,
        instanceLocation: Json.uri(json),
        valid: isValid
      });
      return isValid;
    });

  PubSub.publishSync("result", {
    keyword: keywordId,
    absoluteKeywordLocation: schemaUrl,
    instanceLocation: Json.uri(json),
    valid: isValid
  });
  return isValid;
};

module.exports = { compile, interpret };
