const functions = require("firebase-functions");
const https = require("https");
const r = require("readability-node");
const jsdom = require("jsdom");
const {JSDOM} = jsdom;

exports.app = functions.https.onRequest((req, res) => {
  const url = req.query.url || "http://example.com/";
  https.get(url, (pageRes) => {
    let src = "";
    pageRes.on("data", (d) => src += d);
    pageRes.on("end", () => {
      const doc = new JSDOM(src, {
        features: {
          FetchExternalResources: false,
          ProcessExternalResources: false,
        },
      }).window.document;
      const article = new r.Readability(url, doc).parse();
      res.send(
          "<html><head><meta charset='utf-8'><title>" +
          article.title +
          "</title></head><body>" +
          article.content +
          "</body></html>");
    });
  });
});
