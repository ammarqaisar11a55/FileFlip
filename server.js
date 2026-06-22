module.exports = require('./fileflip_custom_index/server');

if (require.main === module) {
  const app = module.exports;
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`FileFlip running at http://localhost:${port}`);
  });
}
