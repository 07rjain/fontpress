import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { SiteRouter } from './SiteRouter';
import { publicPath } from './seo';
import './styles.css';

const container = document.getElementById('root')!;
const app = <StrictMode><SiteRouter /><Analytics /><SpeedInsights /></StrictMode>;
if (publicPath(window.location.pathname, window.location.hash) && container.hasChildNodes()) hydrateRoot(container, app);
else createRoot(container).render(app);
