import React, { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import logo from "../images/leviatan-core-logo.jpg";

function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  variant = 'default',
}) {
  const location = useLocation();
  const { pathname } = location;

  const trigger = useRef(null);
  const sidebar = useRef(null);

  const storedSidebarExpanded = localStorage.getItem("sidebar-expanded");
  const [sidebarExpanded, setSidebarExpanded] = useState(storedSidebarExpanded === null ? false : storedSidebarExpanded === "true");

  useEffect(() => {
    const clickHandler = ({ target }) => {
      if (!sidebar.current || !trigger.current) return;
      if (!sidebarOpen || sidebar.current.contains(target) || trigger.current.contains(target)) return;
      setSidebarOpen(false);
    };
    document.addEventListener("click", clickHandler);
    return () => document.removeEventListener("click", clickHandler);
  });

  useEffect(() => {
    const keyHandler = ({ keyCode }) => {
      if (!sidebarOpen || keyCode !== 27) return;
      setSidebarOpen(false);
    };
    document.addEventListener("keydown", keyHandler);
    return () => document.removeEventListener("keydown", keyHandler);
  });

  useEffect(() => {
    localStorage.setItem("sidebar-expanded", sidebarExpanded);
    if (sidebarExpanded) {
      document.querySelector("body").classList.add("sidebar-expanded");
    } else {
      document.querySelector("body").classList.remove("sidebar-expanded");
    }
  }, [sidebarExpanded]);

  const linkClass = (isActive) =>
    `block text-gray-800 dark:text-gray-100 truncate transition duration-150 ${
      isActive ? "" : "hover:text-gray-900 dark:hover:text-white"
    }`;

  const itemClass = (active) =>
    `pl-4 pr-3 py-2 rounded-lg mb-0.5 last:mb-0 bg-linear-to-r ${
      active ? "from-violet-500/[0.12] dark:from-violet-500/[0.24] to-violet-500/[0.04]" : ""
    }`;

  return (
    <div className="min-w-fit">
      <div
        className={`fixed inset-0 bg-gray-900/30 z-40 lg:hidden lg:z-auto transition-opacity duration-200 ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden="true"
      ></div>

      <div
        id="sidebar"
        ref={sidebar}
        className={`flex lg:flex! flex-col absolute z-40 left-0 top-0 lg:static lg:left-auto lg:top-auto lg:translate-x-0 h-[100dvh] overflow-y-scroll lg:overflow-y-auto no-scrollbar w-64 lg:w-20 lg:sidebar-expanded:!w-64 2xl:w-64! shrink-0 bg-white dark:bg-gray-800 p-4 transition-all duration-200 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-64"} ${variant === 'v2' ? 'border-r border-gray-200 dark:border-gray-700/60' : 'rounded-r-2xl shadow-xs'}`}
      >
        <div className="flex justify-between mb-10 pr-3 sm:px-2">
          <button
            ref={trigger}
            className="lg:hidden text-gray-500 hover:text-gray-400"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-controls="sidebar"
            aria-expanded={sidebarOpen}
          >
            <span className="sr-only">Close sidebar</span>
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
            </svg>
          </button>
          <NavLink end to="/" className="block" title="Pixdesk · Leviatan Core">
            <img
              src={logo}
              alt="Leviatan Core"
              className="w-8 h-8 rounded-md object-cover ring-1 ring-cyan-400/30"
            />
          </NavLink>
        </div>

        <div className="space-y-8 grow">
          <div>
            <h3 className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold pl-3">
              <span className="hidden lg:block lg:sidebar-expanded:hidden 2xl:hidden text-center w-6" aria-hidden="true">
                •••
              </span>
              <span className="lg:hidden lg:sidebar-expanded:block 2xl:block">Tools</span>
            </h3>
            <ul className="mt-3">
              <li className={itemClass(pathname === "/")}>
                <NavLink end to="/" className={({ isActive }) => linkClass(isActive)}>
                  <div className="flex items-center">
                    <svg className={`shrink-0 fill-current ${pathname === "/" ? "text-violet-500" : "text-gray-400 dark:text-gray-500"}`} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                      <path d="M5.936.278A7.983 7.983 0 0 1 8 0a8 8 0 1 1-8 8c0-.722.104-1.413.278-2.064a1 1 0 1 1 1.932.516A5.99 5.99 0 0 0 2 8a6 6 0 1 0 6-6c-.53 0-1.045.076-1.548.21A1 1 0 1 1 5.936.278Z" />
                      <path d="M6.068 7.482A2.003 2.003 0 0 0 8 10a2 2 0 1 0-.518-3.932L3.707 2.293a1 1 0 0 0-1.414 1.414l3.775 3.775Z" />
                    </svg>
                    <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                      Home
                    </span>
                  </div>
                </NavLink>
              </li>
              <li className={itemClass(pathname.includes("remove-bg"))}>
                <NavLink end to="/remove-bg" className={({ isActive }) => linkClass(isActive)}>
                  <div className="flex items-center">
                    <svg className={`shrink-0 fill-current ${pathname.includes("remove-bg") ? "text-violet-500" : "text-gray-400 dark:text-gray-500"}`} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                      <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H0V2Zm0 5h16v7a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V7Zm4 3a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H4Z" />
                    </svg>
                    <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                      Remove background
                    </span>
                  </div>
                </NavLink>
              </li>
              <li className={itemClass(pathname.includes("thumbnails"))}>
                <NavLink end to="/thumbnails" className={({ isActive }) => linkClass(isActive)}>
                  <div className="flex items-center">
                    <svg className={`shrink-0 fill-current ${pathname.includes("thumbnails") ? "text-violet-500" : "text-gray-400 dark:text-gray-500"}`} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                      <path d="M2 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2Zm7 0a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H9Zm0 8a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H9Z" />
                    </svg>
                    <span className="text-sm font-medium ml-4 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100 duration-200">
                      Thumbnails
                    </span>
                  </div>
                </NavLink>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-4 mt-auto border-t border-gray-200 dark:border-gray-700/60 space-y-2">
          <a
            href="https://github.com/LeviatanCore"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 lg:justify-center lg:sidebar-expanded:justify-start 2xl:justify-start"
            title="Powered by Leviatan Core"
          >
            <img
              src={logo}
              alt=""
              className="w-5 h-5 rounded object-cover ring-1 ring-cyan-400/30 shrink-0"
            />
            <span className="text-[10px] leading-snug text-gray-400 dark:text-gray-500 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100">
              Powered by{' '}
              <span className="text-cyan-500 font-medium">Leviatan Core</span>
            </span>
          </a>
          <p className="text-[10px] leading-snug text-gray-400 dark:text-gray-500 lg:opacity-0 lg:sidebar-expanded:opacity-100 2xl:opacity-100">
            Mosaic Lite by{' '}
            <a
              className="text-violet-500 underline"
              href="https://github.com/cruip/tailwind-dashboard-template"
              target="_blank"
              rel="noreferrer"
            >
              Cruip
            </a>
          </p>
        </div>

        <div className="pt-3 hidden lg:inline-flex 2xl:hidden justify-end">
          <div className="w-12 pl-4 pr-3 py-2">
            <button className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400" onClick={() => setSidebarExpanded(!sidebarExpanded)}>
              <span className="sr-only">Expand / collapse sidebar</span>
              <svg className="shrink-0 fill-current text-gray-400 dark:text-gray-500 sidebar-expanded:rotate-180" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
                <path d="M15 16a1 1 0 0 1-1-1V1a1 1 0 1 1 2 0v14a1 1 0 0 1-1 1ZM8.586 7H1a1 1 0 1 0 0 2h7.586l-2.793 2.793a1 1 0 1 0 1.414 1.414l4.5-4.5A.997.997 0 0 0 12 8.01M11.924 7.617a.997.997 0 0 0-.217-.324l-4.5-4.5a1 1 0 0 0-1.414 1.414L8.586 7M12 7.99a.996.996 0 0 0-.076-.373Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
