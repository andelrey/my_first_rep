// Подменный API Anthropic для проверки ошибок: node tests/e2e/fake-anthropic.mjs (порт 4010).
// Режим — в файле tests/e2e/.fake-mode: credit | overloaded.
import http from "node:http";
import { readFileSync } from "node:fs";
http.createServer((req, res) => {
  req.resume();
  const mode = readFileSync(new URL("./.fake-mode", import.meta.url), "utf8").trim();
  const [status, type, message] = mode === "credit"
    ? [400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API."]
    : [529, "overloaded_error", "Overloaded"];
  res.writeHead(status, { "content-type": "application/json", "x-should-retry": "false" });
  res.end(JSON.stringify({ type: "error", error: { type, message } }));
}).listen(4010, () => console.log("фейковый Anthropic на :4010"));
