// Propertyware HTML data extraction functions

function getValueFromLabel(
  doc: Document,
  labelText: string | RegExp,
): string | null {
  const cells = Array.from(
    doc.querySelectorAll<HTMLTableCellElement>("td, th"),
  );

  const labelCell = cells.find((cell) => {
    const text = cell.textContent?.trim() || "";
    if (typeof labelText === "string") {
      return text.startsWith(labelText);
    }
    return labelText.test(text);
  });

  if (!labelCell) return null;

  const valueCell = labelCell.nextElementSibling as HTMLElement | null;
  if (!valueCell) return null;

  const text = valueCell.textContent
    ?.replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function getHtmlFromLabel(
  doc: Document,
  labelText: string | RegExp,
): string | null {
  const cells = Array.from(
    doc.querySelectorAll<HTMLTableCellElement>("td, th"),
  );

  const labelCell = cells.find((cell) => {
    const text = cell.textContent?.trim() || "";
    if (typeof labelText === "string") {
      return text.startsWith(labelText);
    }
    return labelText.test(text);
  });

  if (!labelCell) return null;

  const valueCell = labelCell.nextElementSibling as HTMLElement | null;
  if (!valueCell) return null;

  const cloned = valueCell.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll("br, BR").forEach((br) => (br.textContent = "\n"));

  const text = cloned.textContent
    ?.replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return text || null;
}

export function extractAddress(unitDoc: Document): string | null {
  const header =
    unitDoc.querySelector("h1, h2, .pageTitle, .headerTitle") ||
    unitDoc.querySelector('[id*="address"], [class*="address"]');

  if (header) {
    const text = header.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  const location = getValueFromLabel(unitDoc, /^Location\b/i);
  if (location) return location;

  const marketingAddress = getValueFromLabel(
    unitDoc,
    /^For Lease - Address Other Description/i,
  );
  if (marketingAddress) return marketingAddress;

  return null;
}

export function extractTenantLines(unitDoc: Document): string[] {
  const tables = Array.from(
    unitDoc.querySelectorAll<HTMLTableElement>("table"),
  );
  let tenantTable: HTMLTableElement | null = null;

  for (const table of tables) {
    const text = table.textContent || "";
    if (/Tenant Information/i.test(text)) {
      tenantTable = table;
      break;
    }
  }

  if (!tenantTable) return [];

  const rows = Array.from(tenantTable.querySelectorAll("tr"));
  if (rows.length < 2) return [];

  const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(
    (c) => c.textContent?.trim() || "",
  );

  const idx = {
    name: headerCells.findIndex((h) => /Primary Contact|Name/i.test(h)),
    home: headerCells.findIndex((h) => /Home Phone/i.test(h)),
    work: headerCells.findIndex((h) => /Work Phone/i.test(h)),
    mobile: headerCells.findIndex((h) => /Mobile Phone/i.test(h)),
    email: headerCells.findIndex((h) => /Email/i.test(h)),
  };

  const lines: string[] = [];

  const get = (cells: HTMLTableCellElement[], i: number) =>
    i >= 0 && i < cells.length
      ? cells[i].textContent?.replace(/\s+/g, " ").trim() || ""
      : "";

  for (const row of rows.slice(1)) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (!cells.length) continue;

    const name = get(cells, idx.name);
    if (!name) continue;

    const home = get(cells, idx.home);
    const work = get(cells, idx.work);
    const mobile = get(cells, idx.mobile);
    const email = get(cells, idx.email);

    lines.push(
      [name, home, work, mobile, email]
        .filter((x) => x && x.length > 0)
        .join(" "),
    );
  }

  return lines;
}

export function extractSecurityInfo(unitDoc: Document): string | null {
  const secureBuilding = getValueFromLabel(
    unitDoc,
    /^Secure Building Entry\?/i,
  );
  const securitySystem = getValueFromLabel(
    unitDoc,
    /^Security System Present\?/i,
  );
  const securityInstr = getHtmlFromLabel(unitDoc, /^Security Instr/i);

  if (!secureBuilding && !securitySystem && !securityInstr) return null;

  const parts: string[] = [];
  if (secureBuilding) parts.push(`Secure Building entry? ${secureBuilding}`);
  if (securitySystem) parts.push(`Security System: ${securitySystem}`);
  if (securityInstr) parts.push(`Instructions: ${securityInstr}`);

  return parts.join(" | ");
}

export function extractKeyInfo(unitDoc: Document): string | null {
  const keyNumber = getValueFromLabel(unitDoc, /^Key Number/i);
  const lockBoxNum = getValueFromLabel(unitDoc, /^Lock Box Num/i);
  const lockBoxCode = getValueFromLabel(unitDoc, /^Lock Box Code/i);
  const lockBoxLocation = getValueFromLabel(unitDoc, /^Lock Box Location/i);

  if (!keyNumber && !lockBoxNum && !lockBoxCode && !lockBoxLocation) {
    return null;
  }

  const parts = [
    keyNumber ? `Key Number: ${keyNumber}` : "",
    lockBoxLocation ? `Lockbox Location: ${lockBoxLocation}` : "",
    lockBoxNum ? `Lockbox Number: ${lockBoxNum}` : "",
    lockBoxCode ? `Lockbox Code: ${lockBoxCode}` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

export function extractGeneralPropertyInfo(unitDoc: Document): string[] {
  const lines: string[] = [];

  const waterShutoff = getValueFromLabel(unitDoc, /^Water Cut-Off Location/i);
  const breaker = getValueFromLabel(unitDoc, /^Breaker Box Location/i);
  const waterHeaterType = getValueFromLabel(unitDoc, /^Water Heater Type/i);
  const waterHeaterLocation = getValueFromLabel(
    unitDoc,
    /^Water Heater LOCATION ONLY/i,
  );
  const heatType = getValueFromLabel(unitDoc, /^Heat Type/i);
  const yearBuilt = getValueFromLabel(unitDoc, /^Year Property Built/i);
  const sqFtAbove = getValueFromLabel(unitDoc, /^Sq Ft Above/i);
  const sqFtBelow = getValueFromLabel(unitDoc, /^Sq Ft Below/i);
  const beds = getValueFromLabel(unitDoc, /^Num Bedrooms/i);
  const baths = getValueFromLabel(unitDoc, /^Num Bathrooms/i);
  const flooring = getHtmlFromLabel(unitDoc, /^Flooring$/i);
  const appliances = getHtmlFromLabel(unitDoc, /^Appliances$/i);
  const coDetector = getValueFromLabel(
    unitDoc,
    /^Carbon Monoxide Detector Required/i,
  );
  const smokeDetLoc = getValueFromLabel(unitDoc, /^Smoke Detector Location/i);
  const filters = getHtmlFromLabel(
    unitDoc,
    /^Air Filter -Sizes and Locations/i,
  );
  const drivingDirections = getHtmlFromLabel(unitDoc, /^Driving Directions/i);

  if (waterShutoff || breaker) {
    lines.push(
      `Water Shut-off: ${waterShutoff || "N/A"} Breaker Box: ${
        breaker || "N/A"
      }`,
    );
  }

  if (waterHeaterType || waterHeaterLocation || heatType) {
    lines.push(
      `Water Heater Type/Location: ${waterHeaterType || "N/A"} / ${
        waterHeaterLocation || "N/A"
      } Heat Type: ${heatType || "N/A"}`,
    );
  }

  if (yearBuilt || sqFtAbove || beds || baths) {
    const size =
      sqFtAbove || sqFtBelow
        ? `${sqFtAbove || "0"}${sqFtBelow ? `+${sqFtBelow}` : ""}`
        : "N/A";

    lines.push(
      `Year Property Built: ${yearBuilt || "N/A"} Property Size: ${size} Bedrooms: ${
        beds || "N/A"
      } Bathrooms: ${baths || "N/A"}`,
    );
  }

  if (flooring) lines.push(`Flooring: ${flooring}`);
  if (appliances) lines.push(`Appliances: ${appliances}`);

  if (coDetector || smokeDetLoc) {
    lines.push(
      `CO Detector: ${coDetector || "N/A"} Smoke detectors: ${
        smokeDetLoc || "N/A"
      }`,
    );
  }

  if (filters) lines.push(`Air Filters: ${filters}`);
  if (drivingDirections) lines.push(`Driving Directions: ${drivingDirections}`);

  return lines;
}
