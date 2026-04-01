import { Helmet } from 'react-helmet';
import { BudgetGenieAI } from '@/components/dashboard/BudgetGenieAI';

const Index = () => {
  return (
    <>
      <Helmet>
        <title>MediaPlanner Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta name="description" content="Professional media plan budget calibrator for iGaming and digital marketing." />
      </Helmet>

      {/* The entire application layout is now handled by BudgetGenieAI */}
      <BudgetGenieAI />
    </>
  );
};

export default Index;