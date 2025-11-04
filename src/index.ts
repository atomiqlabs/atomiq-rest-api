import { createApp } from './app';
import { swapper } from './services';
import config from './config';

/**
 * Start the Atomiq REST API server
 */
async function start() {
  try {
    console.log('=====================================');
    console.log('  Atomiq REST API Middleware');
    console.log('=====================================');
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Port: ${config.port}`);
    console.log(`Storage: ${config.storage.type} (${config.storage.path})`);
    console.log('=====================================\n');

    const app = await createApp(config);

    const server = app.listen(config.port, config.host, () => {
      console.log(`\nServer is running on http://${config.host}:${config.port}`);
      console.log(`API available at http://${config.host}:${config.port}/api/v1`);
      console.log(`Health check: http://${config.host}:${config.port}/api/v1/health\n`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);

      // Stop accepting new requests
      server.close(async () => {
        console.log('HTTP server closed');

        // Stop the swapper (closes LP connections, event listeners, etc.)
        try {
          await swapper.stop();
          console.log('Swapper stopped');
          console.log('Shutdown complete');
          process.exit(0);
        } catch (error) {
          console.error('Error during swapper shutdown:', error);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if this is the main module
if (require.main === module) {
  start();
}

export { createApp };
export default start;
