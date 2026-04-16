import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { usePaymentStatus } from '@/hooks/use-payment-status';

export default function Landing() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { hasActivePayment } = usePaymentStatus();

  // Redirect authenticated + paid users directly to app
  useEffect(() => {
    if (isLoaded && isSignedIn && hasActivePayment) {
      navigate('/app');
    }
  }, [isLoaded, isSignedIn, hasActivePayment, navigate]);

  const handleEnter = () => {
    if (isSignedIn && hasActivePayment) {
      navigate('/app');
    } else if (isSignedIn) {
      navigate('/pricing');
    } else {
      navigate('/auth');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
      <div className="absolute top-0 right-0 w-96 h-96 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-0 left-1/2 w-96 h-96 bg-pink-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-2xl">
        {/* Logo/Brand */}
        <div className="mb-8">
          <h1 className="text-6xl md:text-7xl font-bold text-white mb-4 drop-shadow-lg">
            Budget Genie
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 drop-shadow">
            AI-Powered Media Planning Intelligence
          </p>
        </div>

        {/* Description */}
        <div className="mb-12 space-y-4">
          <p className="text-lg text-white/90 leading-relaxed">
            Transform your media planning with intelligent insights, automated optimization, and
            real-time analytics.
          </p>
          <div className="flex gap-4 justify-center text-white/80 text-sm md:text-base">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span>Real-time Analytics</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚀</span>
              <span>Lightning Fast</span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleEnter}
          size="lg"
          className="px-8 py-6 text-lg font-semibold bg-white text-blue-600 hover:bg-blue-50 shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-105"
        >
          Enter Budget Genie →
        </Button>

        {/* Footer text */}
        <p className="mt-8 text-white/70 text-sm">
          {isSignedIn ? 'Choose your plan to get started' : 'Sign in to unlock premium features'}
        </p>
      </div>

      {/* CSS for animations */}
      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
