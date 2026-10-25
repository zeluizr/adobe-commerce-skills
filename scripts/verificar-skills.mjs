// Verifica las skills de skills/<nombre>/SKILL.md: frontmatter, secciones, la sección
// Reference y que cada ruta de fuente citada exista en el commit fijado en data/fonte.json.
//
// Imprime una línea por resultado, con el prefijo "ok:", "mal:" o "aviso:", y la lee
// scripts/verificar.sh. Sale con 1 si hubo algún "mal:".
//
//   FONTES_DIR=<carpeta con los clones>  comprueba con git en los clones locales
//   sin FONTES_DIR                        pregunta a raw.githubusercontent.com (HEAD)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fuentes = JSON.parse(fs.readFileSync(path.join(raiz, "data/fonte.json"), "utf8")).fuentes;
const porRepo = Object.fromEntries(fuentes.map((f) => [f.repo, f]));

let fallo = false;
const ok = (m) => console.log(`ok:${m}`);
const mal = (m) => {
	console.log(`mal:${m}`);
	fallo = true;
};
const aviso = (m) => console.log(`aviso:${m}`);

const SECCIONES = [
	"When this skill applies",
	"Decision rules",
	"Hard constraints",
	"Preferred pattern",
	"Common failure modes",
	"Review checklist",
	"Reference"
];
const PREFIJO = "adobe-commerce-";
const LIBROS = {
	configuration: "configuration-guide",
	installation: "installation-guide",
	performance: "performance-best-practices",
	upgrade: "upgrade-guide",
	tools: "tools",
	"implementation-playbook": "implementation-playbook",
	"security-and-compliance": "security-and-compliance",
	release: "release"
};
const RUTA = /`((commerce-php|commerce-frontend-core|commerce-webapi|commerce-operations\.en)\/[^`\s]+\.md)`/g;

// La URL pública que corresponde a la ruta de la fuente. En developer.adobe.com, una
// página index.md se sirve con barra final y las demás sin ella.
function urlDe(ruta) {
	const [repo, ...resto] = ruta.split("/");
	const f = porRepo[repo];
	const interior = resto.join("/");
	if (repo === "commerce-operations.en") {
		const enHelp = interior.replace(/^help\//, "").replace(/\.md$/, "");
		const prefijo = Object.keys(f.rutasPublicadas || {})
			.filter((k) => enHelp.startsWith(k))
			.sort((a, b) => b.length - a.length)[0];
		if (prefijo) return `${f.sitio}${f.rutasPublicadas[prefijo]}${enHelp.slice(prefijo.length)}`;
		const [libro, ...pagina] = enHelp.split("/");
		const destino = LIBROS[libro];
		if (!destino) return null;
		return `${f.sitio}${destino}/${pagina.join("/")}`;
	}
	const pagina = interior.replace(/^src\/pages\//, "");
	if (pagina === "index.md") return f.sitio;
	if (pagina.endsWith("/index.md")) return `${f.sitio}${pagina.replace(/index\.md$/, "")}`;
	return `${f.sitio}${pagina.replace(/\.md$/, "")}`;
}

const dirSkills = path.join(raiz, "skills");
const nombres = fs.existsSync(dirSkills)
	? fs.readdirSync(dirSkills).filter((n) => fs.statSync(path.join(dirSkills, n)).isDirectory())
	: [];
if (nombres.length === 0) {
	mal("no hay skills en skills/");
	process.exit(1);
}

const citadas = new Map(); // ruta -> [skills]
let skillsMal = 0;
for (const nombre of nombres.sort()) {
	const archivo = path.join(dirSkills, nombre, "SKILL.md");
	const errores = [];
	if (!fs.existsSync(archivo)) {
		mal(`${nombre}: falta SKILL.md`);
		skillsMal++;
		continue;
	}
	const texto = fs.readFileSync(archivo, "utf8");
	const fm = texto.match(/^---\n([\s\S]*?)\n---\n/);
	if (!fm) errores.push("sin frontmatter");
	else {
		const lineas = fm[1].split("\n");
		const campo = (k) => {
			const l = lineas.find((x) => x.startsWith(k + ":"));
			return l ? l.slice(k.length + 1).trim() : null;
		};
		const n = campo("name");
		if (n !== nombre) errores.push(`name "${n}" distinto de la carpeta`);
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(nombre)) errores.push("la carpeta no está en kebab-case");
		if (!nombre.startsWith(PREFIJO)) errores.push(`sin el prefijo ${PREFIJO}`);
		let d = campo("description");
		if (!d) errores.push("sin description");
		else {
			if (/^".*"$/.test(d)) d = JSON.parse(d);
			if ([...d].length > 1024) errores.push(`description de ${[...d].length} caracteres (máximo 1024)`);
			if (!d.startsWith("Apply when")) errores.push('la description no empieza por "Apply when"');
		}
		if (campo("license") !== "MIT") errores.push("license distinta de MIT");
		if (!campo("compatibility")) errores.push("sin compatibility");
	}
	for (const s of SECCIONES) {
		if (!new RegExp(`^## ${s}$`, "m").test(texto)) errores.push(`falta la sección "## ${s}"`);
	}
	const ref = texto.split(/^## Reference$/m)[1];
	if (ref !== undefined) {
		const cuerpo = ref.split(/^## /m)[0];
		let n = 0;
		for (const linea of cuerpo.split("\n")) {
			for (const m of linea.matchAll(RUTA)) {
				n++;
				const ruta = m[1];
				const url = urlDe(ruta);
				if (!url) errores.push(`no sé derivar la URL de ${ruta}`);
				else if (!linea.includes(`(${url})`)) errores.push(`${ruta}: falta el enlace ${url} en la misma línea`);
				if (!citadas.has(ruta)) citadas.set(ruta, []);
				citadas.get(ruta).push(nombre);
			}
		}
		if (n === 0) errores.push("la sección Reference no cita ninguna fuente");
	}
	const lineas = texto.split("\n").length;
	if (lineas < 120 || lineas > 350) aviso(`${nombre}: ${lineas} líneas (se espera entre 150 y 300)`);
	if (errores.length) {
		mal(`${nombre}: ${errores.join("; ")}`);
		skillsMal++;
	}
}
if (skillsMal === 0) ok(`${nombres.length} skills con frontmatter, secciones y Reference correctos`);

// Las rutas citadas existen en el commit fijado.
const rutas = [...citadas.keys()].sort();
const fontes = process.env.FONTES_DIR;
const faltan = [];
let noVerificadas = 0;
if (fontes) {
	for (const ruta of rutas) {
		const [repo, ...resto] = ruta.split("/");
		const clon = path.join(fontes, repo);
		const commit = porRepo[repo].commit;
		try {
			execFileSync("git", ["-C", clon, "cat-file", "-e", `${commit}:${resto.join("/")}`], { stdio: "ignore" });
		} catch {
			if (!fs.existsSync(path.join(clon, ".git"))) {
				aviso(`no hay clon git de ${repo} en FONTES_DIR (no verificado)`);
				noVerificadas++;
			} else faltan.push(ruta);
		}
	}
} else {
	const pedir = async (ruta) => {
		const [repo, ...resto] = ruta.split("/");
		const url = `https://raw.githubusercontent.com/AdobeDocs/${repo}/${porRepo[repo].commit}/${resto.join("/")}`;
		try {
			const r = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
			if (r.status === 404) faltan.push(ruta);
			else if (!r.ok) noVerificadas++;
		} catch {
			noVerificadas++;
		}
	};
	const cola = [...rutas];
	await Promise.all(
		Array.from({ length: 8 }, async () => {
			while (cola.length) await pedir(cola.shift());
		})
	);
}
for (const ruta of faltan)
	mal(`fuente que no existe en el commit fijado: ${ruta} (citada en ${citadas.get(ruta).join(", ")})`);
if (noVerificadas) {
	const m = `${noVerificadas} de ${rutas.length} fuentes sin respuesta (no verificado)`;
	// En el CI hay red: lo que no se pudo comprobar es una falla, no un aviso.
	if (process.env.CI === "true") mal(m);
	else aviso(m);
}
if (!faltan.length && !noVerificadas)
	ok(
		`las ${rutas.length} fuentes citadas existen en el commit fijado (${fontes ? "clones locales" : "raw.githubusercontent.com"})`
	);

process.exit(fallo ? 1 : 0);
