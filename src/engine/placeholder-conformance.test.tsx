import { placeholderEngine } from './placeholder-engine';
import { describeEnginePort } from './port-conformance';

// The default engine runs the same conformance suite as any engine plugged in after it.
describeEnginePort(placeholderEngine);
