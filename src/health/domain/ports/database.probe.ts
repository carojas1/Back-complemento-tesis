// Whether the database answers. False (never an exception) when it is down or too slow.
export abstract class DatabaseProbe {
  abstract isUp(): Promise<boolean>;
}
