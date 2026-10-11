import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation } from "react-router-dom";
import { DollarSign } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404: user requested a non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <Helmet>
        <title>Page not found | MediaPlanner Pro</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="w-full max-w-md bg-[#1e293b] rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
        <div className="p-8 text-center border-b border-slate-700 bg-[#0f172a]/50">
          <div className="mx-auto h-16 w-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/30">
            <DollarSign className="h-8 w-8 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            MediaPlanner <span className="text-blue-500">Pro</span>
          </p>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm font-semibold text-blue-500 mb-2">404</p>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-2">Page not found</h1>
          <p className="text-slate-400 text-sm mb-4">
            The page you are looking for does not exist or may have been moved.
          </p>
          <p className="mb-6 break-all rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 font-mono text-xs text-slate-300">
            {location.pathname}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Go to homepage
            </Link>
            <Link
              to="/app"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700"
            >
              Open my plan
            </Link>
          </div>
          <Link to="/pricing" className="mt-6 inline-block text-sm text-blue-400 hover:underline">
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
