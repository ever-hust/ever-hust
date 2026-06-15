import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReactElement } from "react";

/**
 * Server-side PDF generation (spec #10/#11) via @react-pdf/renderer — pure-JS, serverless-safe
 * (no headless Chromium), React-native. Renders any advisory artifact (cover letter, résumé,
 * negotiation brief, etc.) into a clean, ATS-friendly single-column document. Shape-agnostic, so
 * new artifact tools export to PDF for free.
 */

const HIDDEN_KEYS = new Set([
  "drafted", "tailored", "briefed", "researched", "prepped", "advised",
  "evaluated", "captured", "updated", "jobId", "grounded", "flaggedClaims",
  "needsApproval", "gateId", "error", "jobTitle", "companyName",
  "schemaVersion", "kind", "contactType",
]);

const styles = StyleSheet.create({
  page: {
    paddingVertical: 48,
    paddingHorizontal: 56,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.45,
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  subtitle: { fontSize: 10, color: "#6b7280", marginBottom: 18 },
  heading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 14,
    marginBottom: 5,
    color: "#1f2937",
  },
  text: { marginBottom: 4 },
  bullet: { marginBottom: 2, paddingLeft: 10 },
  block: { marginBottom: 7, paddingLeft: 6 },
  kvLine: { marginBottom: 2 },
  label: { fontFamily: "Helvetica-Bold" },
});

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function renderValue(value: unknown, keyPrefix: string): ReactElement[] {
  if (value == null || value === "") return [];
  if (typeof value === "string" || typeof value === "number") {
    return [
      <Text key={keyPrefix} style={styles.text}>
        {String(value)}
      </Text>,
    ];
  }
  if (isStringArray(value)) {
    return value.map((item, i) => (
      <Text key={`${keyPrefix}-${i}`} style={styles.bullet}>
        {`• ${item}`}
      </Text>
    ));
  }
  if (Array.isArray(value)) {
    return value.map((item, i) =>
      item && typeof item === "object" ? (
        <View key={`${keyPrefix}-${i}`} style={styles.block}>
          {Object.entries(item as Record<string, unknown>).map(([k, v]) => (
            <Text key={k} style={styles.kvLine}>
              <Text style={styles.label}>{`${humanize(k)}: `}</Text>
              {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
            </Text>
          ))}
        </View>
      ) : (
        <Text key={`${keyPrefix}-${i}`} style={styles.bullet}>
          {`• ${String(item)}`}
        </Text>
      )
    );
  }
  if (typeof value === "object") {
    return [
      <View key={keyPrefix} style={styles.block}>
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <Text key={k} style={styles.kvLine}>
            <Text style={styles.label}>{`${humanize(k)}: `}</Text>
            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}
          </Text>
        ))}
      </View>,
    ];
  }
  return [];
}

export interface ArtifactDocumentProps {
  title: string;
  subtitle?: string;
  data: Record<string, unknown>;
}

export function ArtifactDocument({ title, subtitle, data }: ArtifactDocumentProps): ReactElement {
  const sections = Object.entries(data).filter(
    ([key, value]) =>
      !HIDDEN_KEYS.has(key) &&
      value != null &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0)
  );

  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {sections.map(([key, value]) => (
          <View key={key} wrap={false}>
            <Text style={styles.heading}>{humanize(key)}</Text>
            {renderValue(value, key)}
          </View>
        ))}
      </Page>
    </Document>
  );
}
