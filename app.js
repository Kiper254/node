const express = require('express');
const app = express();
const port = 3000;
const name = "Kacper";
app.get('/', (req, res) => {
  res.send('Działa Express!');
});

app.listen(port, () => {
  console.log(`Serwer Express działa na http://localhost:${port}`);
  console.log(`Mam na imie ${name}`);
});
