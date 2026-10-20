const config = require('./config');
const { createApp } = require('./app');

const app = createApp();

app.listen(config.port, () => {
    console.log(`Server gestionale in ascolto su http://localhost:${config.port}`);
});