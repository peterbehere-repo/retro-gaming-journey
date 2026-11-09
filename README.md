# Save archive

Battery saves and save states pulled off the handhelds by the Retro Gaming Journey page.

    saves/<user>/devices/<device_id>/<system>/<rom>/<file>

* one subtree per device — a device only ever writes to its own folder, so two devices cannot
  overwrite each other;
* save states stay with the device that made them (a state is tied to a core build);
* nothing is deleted here. A missing file locally means "not pulled yet", never "removed";
* every pull is one commit, and a file whose bytes are already in the branch is not re-uploaded.

Restoring is done from the Sync tab of the page, which copies the file it is about to replace
to `<name>.before-<timestamp>` first.
