import { Helmet } from 'react-helmet';
import { useSearchParams } from 'react-router-dom';
import { BRAND_NAME } from '@/lib/brand';
import { OnboardWizard } from '@/components/onboarding/OnboardWizard';
import { QuickStart } from '@/components/onboarding/QuickStart';

/** /onboard opens the one-screen quick start; /onboard?mode=guided keeps the 6-step wizard. */
const Onboard = () => {
  const [params] = useSearchParams();
  return (
    <>
      <Helmet>
        <title>{`Get Started - ${BRAND_NAME}`}</title>
      </Helmet>
      {params.get('mode') === 'guided' ? <OnboardWizard /> : <QuickStart />}
    </>
  );
};

export default Onboard;
