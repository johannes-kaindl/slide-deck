// `npm version <x.y.z>` ruft dies via "version"-Script auf: synct manifest.json + versions.json.
// package.json-Version hat npm zu diesem Zeitpunkt bereits gesetzt.
import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`version-bump: ${version} → minAppVersion ${manifest.minAppVersion}`);
