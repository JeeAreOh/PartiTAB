// Muda a versão do app em todos os lugares: npm run version:set -- 0.2.0
// (package.json é a fonte; o tauri.conf.json lê dali; o Cargo.toml é atualizado aqui.)
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const version = process.argv[2]?.replace(/^v/, "");
if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Uso: npm run version:set -- 1.2.3");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const cargoPath = "src-tauri/Cargo.toml";
const cargo = readFileSync(cargoPath, "utf8").replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);

// Atualiza a versão do pacote no package-lock.json e no Cargo.lock.
execSync("npm install --package-lock-only --ignore-scripts", { stdio: "inherit" });
execSync("cargo update -p partitab --offline", { cwd: "src-tauri", stdio: "inherit" });

console.log(`\nVersão ${version}. Para publicar:`);
console.log(`  git commit -am "Versão ${version}" && git tag v${version} && git push && git push origin v${version}`);
