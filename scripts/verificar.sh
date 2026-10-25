#!/usr/bin/env bash
# Gate del repositorio. Es el mismo comando en la máquina y en el CI: si algo falla,
# sale con código distinto de cero y nada se promueve de rama.
#
#   ./scripts/verificar.sh                         las fuentes se comprueban en GitHub
#   FONTES_DIR=<clones> ./scripts/verificar.sh     las fuentes se comprueban en clones locales
#
# "No verificado" se informa como aviso, nunca como verde.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

FALLO=0
AVISOS=0
paso() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
mal() {
	printf '  \033[31m✗\033[0m %s\n' "$1"
	FALLO=1
}
aviso() {
	printf '  \033[33m⚠\033[0m %s\n' "$1"
	AVISOS=1
}

# ─────────────────────────────── JSON ───────────────────────────────
paso "JSON válido"
JSON_ROTOS=0
while IFS= read -r -d '' f; do
	if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$f" 2>/dev/null; then
		mal "JSON inválido: $f"
		JSON_ROTOS=1
	fi
done < <(find . -name '*.json' -not -path './node_modules/*' -not -path './.git/*' -print0)
[ "$JSON_ROTOS" -eq 0 ] && ok "todos los .json se leen"

# ─────────────────────────────── skills ───────────────────────────────
paso "Skills: frontmatter, secciones y fuentes"
if [ -n "${FONTES_DIR:-}" ]; then
	echo "  fuentes en $FONTES_DIR"
else
	echo "  fuentes en raw.githubusercontent.com (FONTES_DIR sin definir)"
fi
while IFS= read -r linea; do
	case "$linea" in
	ok:*) ok "${linea#ok:}" ;;
	mal:*) mal "${linea#mal:}" ;;
	aviso:*) aviso "${linea#aviso:}" ;;
	*) printf '    %s\n' "$linea" ;;
	esac
done < <(node scripts/verificar-skills.mjs 2>&1 || echo "mal:scripts/verificar-skills.mjs terminó con error")

# ─────────────────────────────── archivos del repositorio ───────────────────────────────
paso "Archivos obligatorios"
FALTAN=0
for f in README.md CHANGELOG.md LICENSE NOTICE data/fonte.json .github/workflows/ci.yml; do
	[ -f "$f" ] || {
		mal "falta $f"
		FALTAN=1
	}
done
[ -e .claude-plugin ] && mal "existe .claude-plugin: instaladas como plugin, las skills cambian de nombre y los agentes no las precargan"
[ "$FALTAN" -eq 0 ] && ok "README, CHANGELOG, LICENSE, NOTICE, data/fonte.json y CI presentes"
if grep -q '—' README.md 2>/dev/null; then
	mal "el README tiene raya (—)"
else
	ok "README sin raya"
fi

# ─────────────────────────────── formato ───────────────────────────────
paso "Formato (Prettier)"
if npx --no-install prettier --check . >/dev/null 2>&1; then
	ok "todo formateado"
else
	npx --no-install prettier --list-different . 2>/dev/null | sed 's/^/    /'
	mal "hay archivos sin formatear: corre 'npm run format'"
fi

paso "Sintaxis de Bash"
SH_ROTOS=0
while IFS= read -r -d '' f; do
	if ! bash -n "$f" 2>/dev/null; then
		mal "error de sintaxis: $f"
		SH_ROTOS=1
	fi
done < <(find . -name '*.sh' -type f -not -path './node_modules/*' -not -path './.git/*' -print0)
[ "$SH_ROTOS" -eq 0 ] && ok "todos los scripts de shell pasan bash -n"

# ─────────────────────────────── rastros ───────────────────────────────
# El repositorio es público: nada de la máquina de quien lo escribe y nada de clientes.
# Este archivo queda fuera de la búsqueda porque contiene los propios patrones.
paso "Rastros"
EXCLUIR=(--exclude-dir=node_modules --exclude-dir=.git --exclude=package-lock.json --exclude=verificar.sh)

buscar() {
	local descripcion="$1" patron="$2"
	shift 2
	local hallado
	hallado=$(grep -rniIE "${EXCLUIR[@]}" "$patron" "$@" 2>/dev/null || true)
	if [ -n "$hallado" ]; then
		printf '%s\n' "$hallado" | head -20 | sed 's/^/    /'
		mal "$descripcion"
	else
		ok "sin $descripcion"
	fi
}

buscar "rutas de una máquina" '/Users/|/Volumes/|/private/tmp|/home/[a-z]|\.dante/' .
buscar "correos personales" '[a-z0-9._%+-]+@(gmail|me|icloud|hotmail|outlook|yahoo)\.com' .
buscar "nombres de clientes" 'construplaza|drsimi|rutpay|casaideas|magriffe|manchile' .
buscar "portugués" '[ãõ]|\bnão\b|\bvocê\b|\btambém\b|\bentão\b|arquivo|ficheiro' .

# ─────────────────────────────── resultado ───────────────────────────────
echo
if [ "$FALLO" -ne 0 ]; then
	printf '\033[31m✗ gate en rojo\033[0m\n'
elif [ "$AVISOS" -ne 0 ]; then
	printf '\033[33m⚠ gate sin fallas, con avisos (lo no verificado no cuenta como verde)\033[0m\n'
else
	printf '\033[32m✓ gate en verde\033[0m\n'
fi
exit "$FALLO"
