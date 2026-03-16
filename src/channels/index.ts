/**
 * Channel self-registration barrel file.
 * Each import triggers the channel module's registerChannel() call.
 * To add a new channel: create the file, add registerChannel() at top level,
 * then add the import here.
 */

import './webui.js';
import './whatsapp.js';
import './telegram.js';
