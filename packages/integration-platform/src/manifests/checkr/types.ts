/** Checkr REST API shapes (https://docs.checkr.com), the fields Comp reads. */

export interface CheckrCandidate {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  custom_id?: string | null;
  report_ids?: string[];
  created_at?: string | null;
}

export type CheckrReportStatus = 'pending' | 'complete' | 'suspended' | 'dispute' | 'canceled';

export interface CheckrReport {
  id: string;
  candidate_id?: string | null;
  status: CheckrReportStatus | string;
  /** `clear`, `consider`, or null until complete */
  result?: string | null;
  /** Employer decision on a `consider` result: `engaged`, `pre_adverse_action`, `post_adverse_action` */
  adjudication?: string | null;
  package?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  turnaround_time?: number | null;
}

/** Checkr list endpoints: `{ data, next_href, count }`. */
export interface CheckrList<T> {
  data?: T[];
  next_href?: string | null;
  count?: number;
}

export type CheckrEnvironment = 'production' | 'staging';

/** Comp's BackgroundCheckStatus values a Checkr report maps onto. */
export type CompBackgroundCheckStatus =
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'completed_with_flags'
  | 'cancelled';
