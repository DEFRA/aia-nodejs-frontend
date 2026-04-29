export const signoutController = {
  handler(request, h) {
    request.yar.reset()
    return h.view('signout/index', {
      pageTitle: 'Signed out',
      isAuthenticationRequired: false
    })
  }
}
