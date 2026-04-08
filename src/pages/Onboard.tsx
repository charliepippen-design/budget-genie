import { Helmet } from 'react-helmet';
import { OnboardWizard } from '@/components/onboarding/OnboardWizard';

const Onboard = () => (
  <>
    <Helmet>
      <title>Get Started - MediaPlanner Pro</title>
    </Helmet>
    <OnboardWizard />
  </>
);

export default Onboard;
