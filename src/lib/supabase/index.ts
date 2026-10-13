// Only export browser client from index
// Server client should be imported directly from './server' in server-side code
export { createClient as createBrowserClient } from './client';
