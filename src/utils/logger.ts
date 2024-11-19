import debug from "debug";

export const logger = {
  info: debug("bfc:info"),
  error: debug("bfc:error"),
  debug: debug("bfc:debug"),
  trace: debug("bfc:trace"),
};
