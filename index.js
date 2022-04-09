const http = require('http');
const fs = require('fs');
const morgan = require('morgan');
const cookie = require('cookie');
const nodemailer = require('nodemailer');
const template = require('./template');

const targetHost = process.env.TARGET_HOST || '127.0.0.1';
const targetPort = process.env.TARGET_PORT || '3000';
const title = process.env.TITLE || 'Gateway';
const port = process.env.PORT || '3300';
const smtpFrom = process.env.SMTP_FROM || 'gateway@hello.world';
const smtp = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: parseInt(process.env.SMTP_PORT || '465'),
  tls: { rejectUnauthorized: false },
  auth: {
    user: process.env.SMTP_USERNAME || 'root',
    pass: process.env.SMTP_PASSWORD || 'passwd',
  },
});

const TOKENS_JSON = './tokens.json';
morgan.token('id', (req) => req.id);
const logger = morgan('":id" :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms')

const tokens = fs.existsSync(TOKENS_JSON) ? require(TOKENS_JSON) : {};
function addToken(token, email) {
  tokens[token] = email
  fs.writeFileSync(TOKENS_JSON, JSON.stringify(tokens));
}
const TOKEN_KEY = 'security_token';

function generateToken() {
  return Math.floor(0x1000000000000 + Math.random() * 0x9000000000000).toString(16);
}

const server = http.createServer((req, res) => {
  req.id = generateToken();
  logger(req, res, () => {
    const cookies = cookie.parse(req.headers.cookie || '');
    if (cookies[TOKEN_KEY] in tokens) {
      const request = http.request({
        host: targetHost,
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      }, (response) => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      req.pipe(request);
      return;
    }
    const g = req.url.match(/^\/set-token\?token=([0-9a-f]+)/);
    if (g) {
      const token = g[1];
      const headers = {
        'Location': '/',
      };
      if (token in tokens) {
        headers['Set-Cookie'] = `security_token=${token}`;
      }
      res.writeHead(302, headers);
      return res.end('');
    }
    if (req.url === '/verify' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => body += chunk);
      req.on('end', () => {
        const g = body.match(/^email=(.+)$/);
        if (g) {
          const to = decodeURIComponent(g[1]);
          const token = generateToken() + generateToken() + generateToken() + generateToken();
          const text = template.email({
            token,
            link: `${req.headers.origin}/set-token?token=${token}`,
          });
          console.log(to);
          smtp.sendMail({
            from: smtpFrom,
            to,
            subject: 'Gateway Verify',
            text,
            html: text,
          }, (err, info) => {
            if (err) {
              console.log('error occurred when sending email. error:', err);
              console.log('info:', info);
              res.end('fail!');
            } else {
              addToken(token, to);
              console.log(`sent token ${token} to ${to}`);
              res.end('sent!');
            }
          });
        } else {
          res.end('bad request');
        }
      });
      return;
    }
    res.end(template.gateway({ title }));
  });
});

server.listen(port);
