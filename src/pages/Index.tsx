import { Helmet } from 'react-helmet';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BudgetGenieAI } from '@/components/dashboard/BudgetGenieAI';
import { useMediaPlanStore } from '@/hooks/use-media-plan-store';

const Index = () => {
  const hasCompleted = useMediaPlanStore((state) => state.hasCompletedOnboarding);
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasCompleted) navigate('/onboard', { replace: true });
  }, [hasCompleted, navigate]);

  if (!hasCompleted) return null;

  return (
    <>
      <Helmet>
        <title>MediaPlanner Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta
          name="description"
          content="Professional media plan budget calibrator for iGaming and digital marketing."
        />
      </Helmet>

      {/* The entire application layout is now handled by BudgetGenieAI */}
      <BudgetGenieAI />
    </>
  );
};

export default Index;
