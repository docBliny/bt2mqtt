import { Variant } from "@docbliny/dbus-next";

// https://dbus.freedesktop.org/doc/dbus-specification.html
export const VARIANT_TYPE_MAPPINGS: Record<string, string> = {
  string: "s",
  int16: "n",
  boolean: "b",
  uint16: "q",
  dict: "e",
};

export type VariantType = "string" | "int16" | "boolean" | "uint16" | "dict";

export function buildTypedValue(type: VariantType, value: string | number | boolean | Record<string, unknown>): Variant {
  const dbusType: string = VARIANT_TYPE_MAPPINGS[type];
  if (!dbusType) {
    throw new Error("Unrecognized type");
  }

  return new Variant(dbusType, value);
}
