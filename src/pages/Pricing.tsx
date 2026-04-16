import { useUser, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePaymentStatus } from '@/hooks/use-payment-status';

export default function Pricing() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { hasActivePayment } = usePaymentStatus();
  const [isProcessing, setIsProcessing] = useState(false);

  // Redirect if already paid or not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/auth');
    }
    if (isLoaded && hasActivePayment) {
      navigate('/app');
    }
  }, [isLoaded, isSignedIn, hasActivePayment, navigate]);

  const handlePaymentClick = async () => {
    if (!user) return;

    setIsProcessing(true);

    try {
      // Initialize NowPay payment
      // Replace with your actual NowPay integration
      const paymentData = {
        userId: user.id,
        userEmail: user.primaryEmailAddress?.emailAddress,
        amount: 9900, // $99.00 in cents
        currency: 'USD',
        description: 'Budget Genie Premium Access',
      };

      // This would normally call your backend to create a NowPay payment session
      // For now, we'll show a placeholder
      console.log('Payment data:', paymentData);

      // Simulate successful payment
      // In production, NowPay will redirect back here with payment confirmation
      alert('Payment integration coming soon. Contact support to enable access.');
      setIsProcessing(false);
    } catch (error) {
      console.error('Payment error:', error);
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600">
            Unlock the full power of Budget Genie
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Basic Plan */}
          <Card className="relative border-2 border-gray-200 hover:border-blue-500 transition-colors">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Starter</CardTitle>
              <p className="text-gray-600 mt-2">Perfect for individuals</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold">$29</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Basic media planning
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Up to 5 campaigns
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Standard analytics
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-400">✗</span>
                  <span className="text-gray-400">AI insights</span>
                </li>
              </ul>
              <Button className="w-full" variant="outline">
                Coming Soon
              </Button>
            </CardContent>
          </Card>

          {/* Premium Plan - FEATURED */}
          <Card className="relative border-2 border-blue-500 shadow-lg transform hover:scale-105 transition-transform">
            <div className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-semibold">
              Most Popular
            </div>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Professional</CardTitle>
              <p className="text-gray-600 mt-2">For serious planners</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold">$99</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Advanced media planning
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Unlimited campaigns
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Advanced analytics
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  AI-powered insights
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-green-500">✓</span>
                  Priority support
                </li>
              </ul>
              <Button
                onClick={handlePaymentClick}
                disabled={isProcessing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6"
              >
                {isProcessing ? 'Processing...' : 'Get Started Now'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* FAQ or Additional Info */}
        <div className="bg-white rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">
            Questions about our pricing?
          </p>
          <Button variant="link">
            Contact our sales team
          </Button>
        </div>
      </div>
    </div>
  );
}
