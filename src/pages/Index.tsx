import { Helmet } from 'react-helmet';
import { BudgetGenieAI } from '@/components/dashboard/BudgetGenieAI';
import { ImportWizard } from '@/components/multi-month/ImportWizard';
import { useState } from 'react';

const Index = () => {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <>
      <Helmet>
        <title>MediaPlanner Pro - Interactive Budget Scaler | iGaming Media Planning</title>
        <meta name="description" content="Professional media plan budget calibrator for iGaming and digital marketing." />
      </Helmet>

      {/* The entire application layout is now handled by BudgetGenieAI */}
      <BudgetGenieAI />

      <ImportWizard open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
};

export default Index;