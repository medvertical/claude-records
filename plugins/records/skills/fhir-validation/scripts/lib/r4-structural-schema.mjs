// Minimal, hand-curated FHIR R4 structural schema for the structural fallback
// validator. This is deliberately small and honest: it covers base-resource
// shape, a curated element allow-list for common resource types, required
// (min-cardinality) elements, choice[x] expansion, and a few required-binding
// code enums. It is NOT a substitute for profile, terminology, invariant, or
// reference validation, and it does not load StructureDefinitions or packages.
//
// Resource types without an entry here still get the generic base-resource
// checks (resourceType, id format, no nulls/empty arrays); unknown-element and
// required-element checks only run for types listed below.

// Elements present on every DomainResource (and thus every resource here).
const domainResource = [
  "id",
  "meta",
  "implicitRules",
  "language",
  "text",
  "contained",
  "extension",
  "modifierExtension",
];

// Expand a choice base into its concrete property names (value -> valueQuantity, ...).
function choice(base, types) {
  return types.map((type) => `${base}${type[0].toUpperCase()}${type.slice(1)}`);
}

const observationValueTypes = [
  "Quantity", "CodeableConcept", "string", "boolean", "integer", "Range",
  "Ratio", "SampledData", "time", "dateTime", "Period",
];
const effectiveTypes = ["dateTime", "Period", "Timing", "instant"];

export const resourceSchemas = {
  Patient: {
    required: [],
    codes: {
      gender: ["male", "female", "other", "unknown"],
    },
    elements: [
      ...domainResource,
      "identifier", "active", "name", "telecom", "gender", "birthDate",
      ...choice("deceased", ["boolean", "dateTime"]),
      "address", "maritalStatus",
      ...choice("multipleBirth", ["boolean", "integer"]),
      "photo", "contact", "communication", "generalPractitioner",
      "managingOrganization", "link",
    ],
  },
  Observation: {
    required: ["status", "code"],
    codes: {
      status: [
        "registered", "preliminary", "final", "amended", "corrected",
        "cancelled", "entered-in-error", "unknown",
      ],
    },
    elements: [
      ...domainResource,
      "identifier", "basedOn", "partOf", "status", "category", "code",
      "subject", "focus", "encounter",
      ...choice("effective", effectiveTypes),
      "issued", "performer",
      ...choice("value", observationValueTypes),
      "dataAbsentReason", "interpretation", "note", "bodySite", "method",
      "specimen", "device", "referenceRange", "hasMember", "derivedFrom",
      "component",
    ],
  },
  Bundle: {
    required: ["type"],
    codes: {
      type: [
        "document", "message", "transaction", "transaction-response",
        "batch", "batch-response", "history", "searchset", "collection",
      ],
    },
    elements: [
      ...domainResource,
      "identifier", "type", "timestamp", "total", "link", "entry", "signature",
    ],
  },
};

export const coveredResourceTypes = Object.keys(resourceSchemas);
