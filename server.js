const http = require('http');
const fs = require('fs').promises;
const fsSync = require('fs');
const url = require('url');
const path = require('path');

const PORT = 3000;
const COUNTER_FILE = 'counter.txt';
const GUESTS_FILE = 'guests.json';
const STATS_FILE = 'stats.json';
const ERROR_LOG = 'errors.log';
const ACCESS_LOG = 'access.log';

let counter = 0;
let stats = {};

process.on('uncaughtException', (err) => {
    const log = `[${new Date().toISOString()}] uncaughtException: ${err.stack}\n`;
    fsSync.appendFile(ERROR_LOG, log, () => {});
    console.error('Nieobsłużony wyjątek:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    const log = `[${new Date().toISOString()}] unhandledRejection: ${reason}\n`;
    fsSync.appendFile(ERROR_LOG, log, () => {});
    console.error('Nieobsłużona obietnica:', reason);
});

function logAccess(ip, path, code) {
    const entry = `[${new Date().toISOString()}] IP: ${ip} | Ścieżka: ${path} | Kod: ${code}\n`;
    fsSync.appendFile(ACCESS_LOG, entry, () => {});
}

const htmlResponse = (content) => `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <title>Lista Gości</title>
    <style>
        body { font-family: Arial; background: #f4f4f4; padding: 20px; }
        h1, h2 { color: #333; }
        ul { list-style: none; padding: 0; }
        li { background: #fff; margin: 5px 0; padding: 10px; border-radius: 5px; }
        form input[type="text"] { padding: 5px; margin-right: 10px; }
        form button { padding: 5px 10px; }
        a { text-decoration: none; color: #007BFF; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <nav>
        <a href="/">Strona główna</a> |
        <a href="/list">Lista gości</a> |
        <a href="/form">Dodaj gościa</a> |
        <a href="/clear">Wyczyść listę</a> |
        <a href="/stats">Statystyki</a>
    </nav>
    <hr>
    ${content}
</body>
</html>`;

(async () => {
    try {
        const data = await fs.readFile(COUNTER_FILE, 'utf8');
        counter = parseInt(data) || 0;
    } catch (_) {}

    try {
        const statsData = await fs.readFile(STATS_FILE, 'utf8');
        stats = JSON.parse(statsData);
    } catch (_) {}
})();

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;
    const ip = req.socket.remoteAddress;

    try {
        if (pathname === '/') {
            counter++;
            await fs.writeFile(COUNTER_FILE, counter.toString());
            stats[ip] = (stats[ip] || 0) + 1;
            await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2));
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlResponse(`<h1>Witaj!</h1><p>Strona została odwiedzona <strong>${counter}</strong> razy.</p>`));

        } else if (pathname === '/add') {
            const name = query.name ? query.name.trim() : '';

            if (!name) {
                logAccess(ip, pathname, 400);
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(htmlResponse(`<p>Błąd: Nie podano imienia (użyj ?name=Imię)</p>`));
            }

            if (/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ -]/.test(name) || name.length > 50) {
                logAccess(ip, pathname, 400);
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(htmlResponse(`<p>Błąd: Imię zawiera niedozwolone znaki lub jest zbyt długie (max 50 znaków).</p>`));
            }

            const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
            const date = new Date().toISOString();
            let guests = [];

            try {
                const data = await fs.readFile(GUESTS_FILE, 'utf8');
                guests = JSON.parse(data);
            } catch (err) {
                if (err.code === 'ENOENT' || err.name === 'SyntaxError') {
                    await fs.writeFile(GUESTS_FILE, '[]');
                    guests = [];
                } else {
                    throw err;
                }
            }

            guests.push({ name: formattedName, date });
            await fs.writeFile(GUESTS_FILE, JSON.stringify(guests, null, 2));
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlResponse(`<p>Dodano gościa: <strong>${formattedName}</strong> (${date})</p>`));

        } else if (pathname === '/list') {
            let guests = [];
            try {
                const data = await fs.readFile(GUESTS_FILE, 'utf8');
                guests = JSON.parse(data);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    logAccess(ip, pathname, 204);
                    res.writeHead(204).end();
                    return;
                } else if (err.name === 'SyntaxError') {
                    await fs.writeFile(GUESTS_FILE, '[]');
                    guests = [];
                } else {
                    throw err;
                }
            }

            if (guests.length === 0) {
                res.end(htmlResponse(`<p>Lista gości jest pusta.</p>`));
            } else {
                const listItems = guests.map((g, i) =>
                    `<li>${g.name} (dodano: ${g.date}) <a href="/remove?index=${i}">[Usuń]</a></li>`).join('');
                res.end(htmlResponse(`<h2>Lista gości:</h2><ul>${listItems}</ul>`));
            }

        } else if (pathname === '/remove') {
            const index = parseInt(query.index);
            let guests = [];

            try {
                const data = await fs.readFile(GUESTS_FILE, 'utf8');
                guests = JSON.parse(data);
            } catch (err) {
                return res.end(htmlResponse(`<p>Nie można odczytać listy.</p>`));
            }

            if (!isNaN(index) && guests[index]) {
                const removed = guests.splice(index, 1);
                await fs.writeFile(GUESTS_FILE, JSON.stringify(guests, null, 2));
                res.end(htmlResponse(`<p>Usunięto gościa: <strong>${removed[0].name}</strong></p>`));
            } else {
                res.end(htmlResponse(`<p>Niepoprawny indeks.</p>`));
            }

        } else if (pathname === '/clear') {
            try {
                await fs.writeFile(GUESTS_FILE, '[]');
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(htmlResponse(`<p>Lista gości została wyczyszczona.</p>`));
            } catch (err) {
                logAccess(ip, pathname, 500);
                res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(htmlResponse(`<p>Nie można usunąć pliku gości. Sprawdź uprawnienia.</p>`));
            }

        } else if (pathname === '/form') {
            const formHTML = `
                <h2>Dodaj gościa</h2>
                <form method="GET" action="/add">
                    <input type="text" name="name" placeholder="Imię" required />
                    <button type="submit">Dodaj</button>
                </form>
            `;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlResponse(formHTML));

        } else if (pathname === '/stats') {
            const items = Object.entries(stats)
                .map(([ip, count]) => `<li>${ip} – ${count} odwiedzin</li>`)
                .join('');
            res.end(htmlResponse(`<h2>Statystyki IP:</h2><ul>${items}</ul>`));

        } else {
            logAccess(ip, pathname, 404);
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(htmlResponse(`<h1>404</h1><p>Nie znaleziono strony.</p>`));
        }

    } catch (err) {
        logAccess(ip, pathname, 500);
        fsSync.appendFile(ERROR_LOG, `[${new Date().toISOString()}] ${err.stack}\n`, () => {});
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlResponse(`<h1>Błąd serwera</h1><p>${err.message}</p>`));
    }
});

server.listen(PORT, () => {
    console.log(`Serwer działa na porcie ${PORT}`);
});
