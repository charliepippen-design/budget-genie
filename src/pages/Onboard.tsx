import { Helmet } from 'react-helmet';
import { BRAND_NAME } from '@/lib/brand';
import { OnboardWizard } from '@/components/onboarding/OnboardWizard';

const Onboard = () => (
  <>
    <Helmet>
      <title>{`Get Started - ${BRAND_NAME}`}</title>
    </Helmet>
    <OnboardWizard />
  </>
);

export default Onboard;
