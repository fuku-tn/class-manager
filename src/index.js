// Điểm vào cho Vercel: xuất app Express làm default export (Vercel biến nó thành một Function).
// Chạy trên máy: dùng src/dev-server.js (npm start). File tĩnh nằm trong public/ do CDN của Vercel phục vụ.
const express = require('express'); // Vercel nhận diện điểm vào Express qua import này
const { openDbLazy } = require('./db');
const { createApp } = require('./create-app');

const app = createApp(openDbLazy());
module.exports = app;
module.exports.default = app;
void express;
