import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { usePaymentStatus } from '@/hooks/use-payment-status';
import { LegalLinks } from '@/pages/Legal';
import { BrandLogo } from '@/components/common/BrandLogo';
import { BRAND_DOMAIN, BRAND_NAME, BRAND_TAGLINE } from '@/lib/brand';

export default function Landing() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { hasActivePayment } = usePaymentStatus();

  // Redirect authenticated + paid users directly to app
  useEffect(() => {
    if (isLoaded && isSignedIn && hasActivePayment) {
      navigate('/app', { replace: true });
    }
  }, [isLoaded, isSignedIn, hasActivePayment, navigate]);

  const handleEnter = () => {
    // Free tier: every signed-in user goes to the app (AI usage is capped server-side).
    if (isSignedIn) {
      navigate('/app');
    } else {
      navigate('/sign-up');
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
          <p className="text-sm uppercase tracking-[0.4em] text-blue-100/80 mb-3">
            {BRAND_DOMAIN}
          </p>
          <BrandLogo size="lg" as="h1" stacked className="mb-4 [&_h1]:text-6xl md:[&_h1]:text-7xl [&_h1]:drop-shadow-lg" />
          <p className="text-xl md:text-2xl text-blue-100 drop-shadow">
            {BRAND_TAGLINE}
          </p>
        </div>

        {/* Description */}
        <div className="mb-12 space-y-4">
          <p className="text-lg text-white/90 leading-relaxed">
            Transform your media planning with intelligent insights, automated optimization, and
            instant scenario modeling.
          </p>
          <div className="flex gap-4 justify-center text-white/80 text-sm md:text-base">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📊</span>
              <span>Instant Scenario Modeling</span>
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
          Enter {BRAND_NAME} →
        </Button>
        {isLoaded && !isSignedIn && (
          <p className="mt-4 text-white/80 text-sm">
            Already have an account?{' '}
            <Link to="/auth" className="font-semibold underline">
              Sign in
            </Link>
          </p>
        )}

        {/* Footer text */}
        <p className="mt-8 text-white/70 text-sm">
          {isSignedIn ? 'Choose your plan to get started' : 'Sign in to unlock premium features'}
        </p>
        <LegalLinks className="mt-6 text-white/70" />
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
