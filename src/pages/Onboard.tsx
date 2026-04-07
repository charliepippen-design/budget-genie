import { Helmet } from 'react-helmet';
import { OnboardWizard } from '@/components/onboarding/OnboardWizard';

const Onboard = () => (
  <>
    <Helmet>
      <title>Get Started - Budget Genie</title>
    </Helmet>
    <OnboardWizard />
  </>
);

export default Onboard;
