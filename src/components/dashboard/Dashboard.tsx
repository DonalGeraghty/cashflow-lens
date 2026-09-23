import { DrillExplorer } from '../DrillExplorer';
import { BucketPanel } from './BucketPanel';
import { CategoryPanel } from './CategoryPanel';
import { ChangePanel } from './ChangePanel';
import { MerchantPanel } from './MerchantPanel';
import { RecurringPanel } from './RecurringPanel';

export function Dashboard() {
  return (
    <div className="dashboard">
      <DrillExplorer />
      <div className="grid-2">
        <CategoryPanel />
        <MerchantPanel />
      </div>
      <div className="grid-2">
        <ChangePanel />
        <BucketPanel />
      </div>
      <RecurringPanel />
    </div>
  );
}
