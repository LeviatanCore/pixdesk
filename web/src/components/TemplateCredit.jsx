import logo from '../images/leviatan-core-logo.jpg';

function TemplateCredit({ className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      <a
        href="https://github.com/LeviatanCore"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2.5 group"
      >
        <img
          src={logo}
          alt="Leviatan Core"
          className="w-8 h-8 rounded-md object-cover ring-1 ring-cyan-400/40"
        />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Powered by{' '}
          <span className="font-semibold text-cyan-500 group-hover:text-cyan-400">
            Leviatan Core
          </span>
        </span>
      </a>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        UI based on{' '}
        <a
          className="text-violet-500 hover:text-violet-600 underline"
          href="https://github.com/cruip/tailwind-dashboard-template"
          target="_blank"
          rel="noreferrer"
        >
          Mosaic Lite
        </a>{' '}
        by{' '}
        <a
          className="text-violet-500 hover:text-violet-600 underline"
          href="https://cruip.com/"
          target="_blank"
          rel="noreferrer"
        >
          Cruip
        </a>
        . Template repo:{' '}
        <a
          className="text-violet-500 hover:text-violet-600 underline"
          href="https://github.com/cruip/tailwind-dashboard-template"
          target="_blank"
          rel="noreferrer"
        >
          github.com/cruip/tailwind-dashboard-template
        </a>
      </p>
    </div>
  );
}

export default TemplateCredit;
