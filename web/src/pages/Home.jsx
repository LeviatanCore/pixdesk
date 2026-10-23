import React from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';

function Home() {
  return (
    <AppShell title="Pixdesk">
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-8 max-w-2xl">
        Local image tools for streamers and creators. Remove backgrounds or compose
        Shorts thumbnails — files stay on your machine.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          to="/remove-bg"
          className="block bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xs border border-gray-200/60 dark:border-gray-700/60 hover:border-violet-400 dark:hover:border-violet-500 transition"
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
            Remove background
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Upload a photo, cut out the subject in the browser, download a transparent PNG,
            or send it to the thumbnail editor.
          </p>
        </Link>

        <Link
          to="/thumbnails"
          className="block bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xs border border-gray-200/60 dark:border-gray-700/60 hover:border-violet-400 dark:hover:border-violet-500 transition"
        >
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">
            Shorts thumbnails
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Build a 1080×1920 (9:16) cover with subject image, title, subtitle, and background color.
          </p>
        </Link>
      </div>
    </AppShell>
  );
}

export default Home;
