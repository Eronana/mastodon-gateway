exports.gateway = (p) => `<html>
  <head>
    <title>${p.title}</title>
  </head>
  <body>
    <h2>${p.title}</h2>
  </body>
  <form action="/verify" method="POST">
    email: <input name="email"/>
    <input type="submit"/>
  </form>
</html>
`;

exports.email = (p) => `verify link: ${p.link}`;