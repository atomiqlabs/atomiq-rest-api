import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { AppConfig } from './config';
import { errorHandler, notFoundHandler } from './api/middleware';
import { createRouter } from './api/routes';
import { swapper } from './services';

/**
 * Create and configure Express application
 * Stateless - all persistence handled by Atomiq SDK
 */
export async function createApp(config: AppConfig): Promise<Express> {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));

  // Logging middleware
  if (config.nodeEnv !== 'test') {
    app.use(morgan('combined'));
  }

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize SDK (handles storage internally)
  console.log('[App] Initializing Atomiq SDK...');

  // Initialize the swapper (connects to LPs, checks existing swaps)
  console.log('[App] Calling swapper.init()...');
  await swapper.init();

  // Create router with handler functions
  const router = createRouter();

  // Mount API routes
  app.use('/api/v1', router);

  // Error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  console.log('[App] Application configured successfully');

  return app;
}
