import assert from "node:assert/strict";
import test from "node:test";
import { addressHitsFromGoogle, addressHitsFromPhoton, shortStreet, stateCode } from "./address-suggest";

test("photon hits become two-line US addresses, numbered first", () => {
  const hits = addressHitsFromPhoton(
    {
      features: [
        { properties: { countrycode: "US", type: "street", name: "Central Avenue", city: "Hot Springs", state: "Arkansas", postcode: "71901" } },
        { properties: { countrycode: "US", housenumber: "118", street: "Central Avenue", city: "Hot Springs", state: "Arkansas", postcode: "71901" } },
        { properties: { countrycode: "PT", housenumber: "118", street: "Avenida Central", city: "Braga" } },
      ],
    },
    "118 Central Ave"
  );
  assert.deepEqual(hits[0], { line1: "118 Central Ave", line2: "Hot Springs, AR 71901", full: "118 Central Ave, Hot Springs, AR 71901" });
  assert.equal(hits.length, 1, "street-only row with the typed number dedupes into the same address");
  assert.equal(addressHitsFromPhoton(null).length, 0);
});

test("google suggestions and small helpers", () => {
  const hits = addressHitsFromGoogle({
    suggestions: [{ placePrediction: { structuredFormat: { mainText: { text: "118 Central Ave" }, secondaryText: { text: "Hot Springs, AR, USA" } } } }],
  });
  assert.equal(hits[0].full, "118 Central Ave, Hot Springs, AR");
  assert.equal(shortStreet("118 Central Avenue Suite B"), "118 Central Ave Ste B");
  assert.equal(stateCode("arkansas"), "AR");
  assert.equal(stateCode("AR"), "AR");
});
