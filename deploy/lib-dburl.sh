# Shared helper, loaded by backup.sh and restore.sh (not run on its own).
#
# Turns a database address like postgresql://user:password@host:5432/dbname into the separate PGHOST, PGUSER,
# PGPASSWORD, ... settings that pg_dump and psql read. Doing it this way keeps the password out of the command line,
# where other programs could see it. It uses node (already installed on the server) so that special characters in the
# password (written %40 and the like in the address) are decoded correctly.
export_pg_env() {
  local lines
  lines="$(DBURL="$1" node -e '
    const q = (s) => "\x27" + String(s).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
    let u;
    try { u = new URL(process.env.DBURL); } catch { console.error("The database address is not a valid URL."); process.exit(1); }
    const out = [];
    const put = (k, v) => { if (v !== "" && v !== undefined) out.push("export " + k + "=" + q(v)); };
    put("PGHOST", u.hostname);
    put("PGPORT", u.port || "5432");
    put("PGUSER", decodeURIComponent(u.username));
    put("PGPASSWORD", decodeURIComponent(u.password));
    put("PGDATABASE", decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres");
    const ssl = u.searchParams.get("sslmode");
    if (ssl) put("PGSSLMODE", ssl);
    console.log(out.join("\n"));
  ')" || return 1
  eval "$lines"
}
