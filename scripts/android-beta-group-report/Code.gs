// Read-only aggregate bridge for the existing consumer Google Group.
// Authorize as its owner; store REPORT_TOKEN in Script Properties, never here.
function doPost(e) {
  const json = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  const expected = PropertiesService.getScriptProperties().getProperty('REPORT_TOKEN');
  let request;
  try { request = JSON.parse(e.postData.contents); } catch (_) { return json({status:'unauthorized'}); }
  if (!expected || !request || request.token !== expected) return json({status:'unauthorized'});
  try {
    const group = GroupsApp.getGroupByEmail('couples-alarm-android-beta@googlegroups.com');
    const users = group.getUsers();
    const roles = group.getRoles(users);
    const active = roles.filter(role => [GroupsApp.Role.OWNER,GroupsApp.Role.MANAGER,GroupsApp.Role.MEMBER].includes(role));
    const owners = active.filter(role => role === GroupsApp.Role.OWNER).length;
    return json({schemaVersion:1,group:'couples-alarm-android-beta',updatedAt:new Date().toISOString(),members:active.length,
      owners,nonOwnerMembers:active.length-owners});
  } catch (_) { return json({status:'unavailable'}); }
}
