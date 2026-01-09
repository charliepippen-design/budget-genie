import React from 'react';
import { Construction } from 'lucide-react';

const UnderConstruction: React.FC = () => {
    return (
        <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-center p-4">
            <div className="bg-slate-900/50 p-6 rounded-full border border-slate-800 mb-6 animate-pulse">
                <Construction className="w-16 h-16 text-indigo-500" />
            </div>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-4 tracking-tight">
                System Upgrade in Progress
            </h1>
            <p className="text-lg text-slate-400 max-w-md">
                We're deploying some magic updates to the Budget Genie. <br />
                Please check back soon.
            </p>
        </div>
    );
};

export default UnderConstruction;
