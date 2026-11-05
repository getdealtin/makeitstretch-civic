// Landing page helpers: live city list and partner share links / QR codes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../server.js';

let server, base;
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

test('city list comes from city settings (national is not a city)', async () => {
  const cities = await (await fetch(`${base}/api/cities`)).json();
  assert.deepEqual(cities.map(c => c.id), ['austin']);
  assert.equal(cities[0].url, 'https://austin.makeitstretch.org/');
  assert.equal(cities[0].region, 'TX');
});

test('QR code: allowed source tag kept, unknown tag dropped, unknown city 404', async () => {
  const ok = await fetch(`${base}/share/qr.svg?city=austin&src=library`);
  assert.match(ok.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await ok.text(), /<svg/);
  const dl = await fetch(`${base}/share/qr.svg?city=austin&src=evil&download=1`);
  assert.match(dl.headers.get('content-disposition'), /make-it-stretch-austin\.svg/);
  assert.equal((await fetch(`${base}/share/qr.svg?city=nowhere`)).status, 404);
});

test('bare domain gets the landing page; city subdomain gets the tool', async () => {
  // fetch() won't send a custom Host header, so use node:http
  const get = host => new Promise((ok, no) => http.get({ port: server.address().port, path: '/', headers: { host } }, res => {
    let b = ''; res.on('data', c => { b += c; }); res.on('end', () => ok(b));
  }).on('error', no));
  assert.match(await get('makeitstretch.org'), /id="hero-title"/);
  assert.match(await get('austin.makeitstretch.org'), /id="app"/);
});

test('city-specific partner names come from city settings', async () => {
  const [austin] = await (await fetch(`${base}/api/cities`)).json();
  assert.equal(austin.source_labels.ctfb, 'Central Texas Food Bank');
});

test('plan QR code: only this site\'s own plan links', async () => {
  const ok = await fetch(`${base}/qr.svg?h=${encodeURIComponent('#p=abc123_-')}`);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /<svg/);
  for (const bad of ['https://evil.example', '#x=abc', '#p=<script>', '']) {
    assert.equal((await fetch(`${base}/qr.svg?h=${encodeURIComponent(bad)}`)).status, 400, bad);
  }
});

test('/packet serves the tool (staff packet page)', async () => {
  const r = await fetch(`${base}/packet`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /id="app"/);
});
